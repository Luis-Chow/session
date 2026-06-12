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
        res.json({ msg: 'Login OK.', objectSession: result.data });
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
    res.json({ objectSession: ses.getDataSession() });
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
            ['model', 'seedPermAdminListUsers'],
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