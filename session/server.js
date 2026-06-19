const express = require('express');
const cors = require('cors');
const config = require('./config.json');
const DBComponent = require('./dbcomponent');
const { AppError } = require('./dbcomponent');
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

// El permiso para crear cuentas vive en la BD (permission_method), igual que cualquier otro metodo.
// Se usa para decirle al cliente si debe habilitar el formulario de "Crear cuenta".
const REGISTER_J = { subsystem: 'security', objectName: 'User', methodName: 'insertUser' };
// Permiso para asignar/quitar perfiles a otros usuarios (tambien vive en la BD).
const MANAGE_PROFILES_J = { subsystem: 'security', objectName: 'UserProfile', methodName: 'addUserProfile' };

// Arma la respuesta de sesion: solo los permisos (no se guardan en la cookie).
async function withPermissions(data) {
    return {
        ...data,
        canRegister: global.sec.getPermissionMethod(REGISTER_J, data.profile_id),
        canManageProfiles: global.sec.getPermissionMethod(MANAGE_PROFILES_J, data.profile_id)
    };
}

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
        res.json({ msg: 'Login OK.', objectSession: await withPermissions(result.data) });
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

app.get('/me', async (req, res) => {
    const ses = new Session(req, global.dbc);
    if (!ses.sessionExist()) {
        return res.status(401).json({ msg: 'No hay sesión activa.' });
    }
    res.json({ objectSession: await withPermissions(ses.getDataSession()) });
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

        // 4) ejecuta el metodo (pasando la sesion) y devuelve la respuesta
        const rows = await global.sec.exeMethod(j, data);
        return res.json({ data: rows });
    } catch (err) {
        // Un metodo rico puede lanzar AppError con su propio status (400 validacion, 409 duplicado...).
        if (err instanceof AppError) {
            return res.status(err.status).json({ msg: err.message, errors: err.errors });
        }
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
            ['model', 'seedProfileEmpleado'],
            ['model', 'seedSubsystemSecurity'],
            ['model', 'seedObjectUser'],
            ['model', 'seedMethodListUsers'],
            ['model', 'seedMethodRegister'],
            ['model', 'seedPermAdminListUsers'],
            ['model', 'seedPermAdminRegister'],
            ['model', 'seedUserAdmin'],
            ['model', 'seedUserEmpleado'],
            ['model', 'seedUserProfile'],
            ['model', 'seedObjectUserProfile'],
            ['model', 'seedMethodListProfiles'],
            ['model', 'seedMethodListUserProfiles'],
            ['model', 'seedMethodAddUserProfile'],
            ['model', 'seedMethodRemoveUserProfile'],
            ['model', 'seedPermAdminListProfiles'],
            ['model', 'seedPermAdminListUserProfiles'],
            ['model', 'seedPermAdminAddUserProfile'],
            ['model', 'seedPermAdminRemoveUserProfile']
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