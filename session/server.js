const express = require('express');
const cors = require('cors');
const config = require('./config.json');
const DBComponent = require('./dbcomponent');
const Session = require('./session');
const Security = require('./security');
const path = require('path');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

global.dbc = new DBComponent();

Session.initMiddleware(app);

app.use(express.static(path.join(__dirname, 'public')));

// Las cuentas creadas nacen como Cliente (perfil 2), nunca como Administrador.
const REGISTER_PROFILE_ID = 2;
const REGISTER_STATUS_ID = 1;

// El permiso para crear cuentas vive en la BD (permission_method), igual que cualquier otro metodo.
const REGISTER_J = { subsystem: 'security', objectName: 'User', methodName: 'insertUser' };

// Agrega los permisos del usuario de sesion a la respuesta (no se guardan en la cookie).
function withPermissions(data) {
    return { ...data, canRegister: global.sec.getPermissionMethod(REGISTER_J, data.profile_id) };
}

app.post('/register', async (req, res) => {
    const ses = new Session(req, global.dbc);
    if (!ses.sessionExist()) {
        return res.status(401).json({ msg: 'Debe iniciar sesión.' });
    }
    if (!global.sec.getPermissionMethod(REGISTER_J, ses.getDataSession().profile_id)) {
        return res.status(403).json({ msg: 'Acceso denegado.' });
    }

    const { user_na, user_pw } = req.body;
    if (!user_na || !user_pw) {
        return res.status(400).json({ msg: 'Falta usuario o contraseña.' });
    }

    const errors = [];
    if (user_na.length < 3) errors.push('El usuario debe tener al menos 3 caracteres.');
    if (/\s/.test(user_na)) errors.push('El usuario no debe contener espacios.');
    if (user_pw.length < 8) errors.push('La contraseña debe tener al menos 8 caracteres.');
    if (user_pw.length > 64) errors.push('La contraseña no debe superar los 64 caracteres.');
    if (/\s/.test(user_pw)) errors.push('La contraseña no debe contener espacios.');
    if (!/[a-z]/.test(user_pw)) errors.push('La contraseña debe incluir al menos una letra minúscula.');
    if (!/[A-Z]/.test(user_pw)) errors.push('La contraseña debe incluir al menos una letra mayúscula.');
    if (!/[0-9]/.test(user_pw)) errors.push('La contraseña debe incluir al menos un número.');
    if (errors.length) {
        return res.status(400).json({ msg: 'No se pudo registrar: revisa los requisitos.', errors });
    }

    try {
        const rows = await global.dbc.exeQuery(
            global.dbc.getSentence('security', 'insertUser'),
            [user_na, user_pw, REGISTER_PROFILE_ID, REGISTER_STATUS_ID]
        );
        const newUserId = rows[0].user_id;
        await global.dbc.exeQuery(global.dbc.getSentence('model', 'insertUserProfile'), [newUserId, REGISTER_PROFILE_ID]);
        res.status(201).json({ msg: 'Usuario creado.', user_id: newUserId });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ msg: 'El usuario ya existe.' });
        }
        console.error(err);
        res.status(500).json({ msg: 'Error al crear el usuario.' });
    }
});

app.post('/login', async (req, res) => {
    const { user_na, user_pw } = req.body;
    if (!user_na || !user_pw) {
        return res.status(400).json({ msg: 'Falta usuario o contraseña.' });
    }
    try {
        const ses = new Session(req, global.dbc);
        const result = await ses.login(user_na, user_pw);
        if (!result.ok) {
            return res.status(401).json({ msg: result.msg });
        }
        res.json({ msg: 'Login OK.', objectSession: withPermissions(result.data) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Error al iniciar sesión.' });
    }
});

app.post('/logout', async (req, res) => {
    try {
        const ses = new Session(req, global.dbc);
        await ses.logout();
        res.clearCookie(config.session.name);
        res.json({ msg: 'Sesión cerrada.' });
    } catch (err) {
        res.status(500).json({ msg: 'Error al cerrar sesión.' });
    }
});

app.get('/me', (req, res) => {
    const ses = new Session(req, global.dbc);
    if (!ses.sessionExist()) {
        return res.status(401).json({ msg: 'No hay sesión activa.' });
    }
    res.json({ objectSession: withPermissions(ses.getDataSession()) });
});

// Dispatcher: toda solicitud de ejecucion de metodos entra por aqui.
app.post('/toProcess', async (req, res) => {
    try {
        // 1) ¿tiene sesion?
        const ses = new Session(req, global.dbc);
        if (!ses.sessionExist()) {
            return res.status(401).json({ msg: 'Debe iniciar sesión.' });
        }

        // 2) datos de la transaccion (j) y de la sesion
        const data = ses.getDataSession();
        const j = {
            subsystem: req.body.subsystem,
            objectName: req.body.objectName,
            methodName: req.body.methodName,
            params: req.body.params || []
        };

        // 3) ¿tiene permiso de ejecutar el metodo?
        if (!global.sec.getPermissionMethod(j, data.profile_id)) {
            return res.status(403).json({ msg: 'Acceso denegado.' });
        }

        // 4) ejecuta el metodo y devuelve la respuesta
        const rows = await global.sec.exeMethod(j);
        return res.json({ data: rows });
    } catch (err) {
        console.error('Error en /toProcess:', err);
        return res.status(500).json({ msg: 'Error al procesar la solicitud.' });
    }
});

(async () => {
    try {
        const ddl = [
            ['security', 'createUserTable'],
            ['model', 'createProfile'],
            ['model', 'createSubsystem'],
            ['model', 'createObject'],
            ['model', 'createMethod'],
            ['model', 'createOption'],
            ['model', 'createPermissionMethod'],
            ['model', 'createPermissionOption'],
            ['model', 'createUserProfile']
        ];
        for (const [schema, id] of ddl) {
            await global.dbc.exeQuery(global.dbc.getSentence(schema, id));
        }

        const seeds = [
            ['model', 'seedProfileAdmin'],
            ['model', 'seedProfileCliente'],
            ['model', 'seedSubsystemSecurity'],
            ['model', 'seedObjectUser'],
            ['model', 'seedMethodListUsers'],
            ['model', 'seedMethodRegister'],
            ['model', 'seedPermAdminListUsers'],
            ['model', 'seedPermAdminRegister'],
            ['model', 'seedUserAdmin'],
            ['model', 'seedUserCliente'],
            ['model', 'seedUserProfile']
        ];
        for (const [schema, id] of seeds) {
            await global.dbc.exeQuery(global.dbc.getSentence(schema, id));
        }
        console.log('Base de datos lista: modelo de seguridad y datos.');

        global.sec = new Security();

        app.listen(config.server.port, () => {
            console.log(`Servidor escuchando en el puerto ${config.server.port}`);
        });
    } catch (err) {
        console.error('Fallo al inicializar la aplicación:', err.message);
        process.exit(1);
    }
})();