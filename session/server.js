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

const db = new DBComponent();
global.dbc = db;

const DEFAULT_PROFILE_ID = 2;
const DEFAULT_STATUS_ID = 1;
const USER_MIN = 3, PW_MIN = 8, PW_MAX = 64;
const MSG_MISSING_CREDENTIALS = 'Falta usuario o contraseña.';
const MANAGE_OPTION = { subsystem: 'security', optionName: 'managePermissions' };
const profilesOf = (data) => data.profiles || [data.profile_id];

Session.initMiddleware(app);

app.use(express.static(path.join(__dirname, 'public')));

app.post('/register', async (req, res) => {
    const { user_na, user_pw, profile_id = DEFAULT_PROFILE_ID, status_id = DEFAULT_STATUS_ID } = req.body;
    if (!user_na || !user_pw) {
        return res.status(400).json({ msg: MSG_MISSING_CREDENTIALS });
    }

    const errors = [];
    if (user_na.length < USER_MIN) errors.push(`El usuario debe tener al menos ${USER_MIN} caracteres.`);
    if (/\s/.test(user_na)) errors.push('El usuario no debe contener espacios.');
    if (user_pw.length < PW_MIN) errors.push(`La contraseña debe tener al menos ${PW_MIN} caracteres.`);
    if (user_pw.length > PW_MAX) errors.push(`La contraseña no debe superar los ${PW_MAX} caracteres.`);
    if (/\s/.test(user_pw)) errors.push('La contraseña no debe contener espacios.');
    if (!/[a-z]/.test(user_pw)) errors.push('La contraseña debe incluir al menos una letra minúscula.');
    if (!/[A-Z]/.test(user_pw)) errors.push('La contraseña debe incluir al menos una letra mayúscula.');
    if (!/[0-9]/.test(user_pw)) errors.push('La contraseña debe incluir al menos un número.');
    if (errors.length) {
        return res.status(400).json({
            msg: 'No se pudo registrar: revisa los requisitos.',
            errors
        });
    }

    try {
        const rows = await db.exeQuery(
            db.getSentence('security', 'insertUser'),
            [user_na, user_pw, profile_id, status_id]
        );
        const newUserId = rows[0].user_id;
        await db.exeQuery(db.getSentence('model', 'insertUserProfile'), [newUserId, profile_id]);
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
        return res.status(400).json({ msg: MSG_MISSING_CREDENTIALS });
    }
    try {
        const ses = new Session(req, db);
        const result = await ses.login(user_na, user_pw);
        if (!result.ok) {
            return res.status(401).json({ msg: result.msg });
        }
        const profiles = profilesOf(result.data);
        const permissions = global.sec.getAllowedMethods(profiles);
        const canManage = global.sec.getPermissionOption(MANAGE_OPTION, profiles);
        res.json({ msg: 'Login OK.', objectSession: result.data, permissions, canManage });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Error al iniciar sesión.' });
    }
});

app.post('/logout', async (req, res) => {
    try {
        const ses = new Session(req, db);
        await ses.logout();
        res.clearCookie(config.session.name);
        res.json({ msg: 'Sesión cerrada.' });
    } catch (err) {
        res.status(500).json({ msg: 'Error al cerrar sesión.' });
    }
});

app.get('/me', (req, res) => {
    const ses = new Session(req, db);
    if (!ses.sessionExist()) {
        return res.status(401).json({ msg: 'No hay sesión activa.' });
    }
    const data = ses.getDataSession();
    const profiles = profilesOf(data);
    const permissions = global.sec.getAllowedMethods(profiles);
    const canManage = global.sec.getPermissionOption(MANAGE_OPTION, profiles);
    res.json({ objectSession: data, permissions, canManage });
});

app.get('/privado', (req, res) => {
    const ses = new Session(req, db);
    if (!ses.sessionExist()) {
        return res.status(401).json({ msg: 'No autorizado. Inicia sesión primero.' });
    }
    const data = ses.getDataSession();
    res.json({
        msg: `Hola ${data.user_na}, esta es una ruta privada.`,
        objectSession: data
    });
});

app.post('/toProcess', async (req, res) => {
    try {
        const ses = new Session(req, db);
        if (!ses.sessionExist()) {
            return res.status(401).json({ msg: 'Debe iniciar sesión. Acceso denegado.' });
        }

        const data = ses.getDataSession();
        const profiles = profilesOf(data);
        const j = {
            subsystem: req.body.subsystem,
            objectName: req.body.objectName,
            methodName: req.body.methodName,
            params: req.body.params || []
        };

        if (!global.sec.getPermissionMethod(j, profiles)) {
            return res.status(403).json({ msg: 'Acceso denegado.' });
        }

        const rows = await global.sec.exeMethod(j);
        return res.json({ data: rows });
    } catch (err) {
        console.error('Error en /toProcess:', err);
        return res.status(500).json({ msg: 'Error al procesar la solicitud.' });
    }
});

function manageGuard(req, res) {
    const ses = new Session(req, db);
    if (!ses.sessionExist()) {
        res.status(401).json({ msg: 'Debe iniciar sesión.' });
        return null;
    }
    const profiles = profilesOf(ses.getDataSession());
    if (!global.sec.getPermissionOption(MANAGE_OPTION, profiles)) {
        res.status(403).json({ msg: 'Acceso denegado.' });
        return null;
    }
    return profiles;
}

// Catalogo para poblar el panel de admin: perfiles, usuarios y sus asignaciones de perfil.
app.get('/admin/catalog', async (req, res) => {
    if (!manageGuard(req, res)) return;
    try {
        const profiles = await db.exeQuery(db.getSentence('model', 'listProfiles'));
        const users = await db.exeQuery(db.getSentence('security', 'listUsers'));
        // Pares usuario-perfil ya asignados, para marcar los checkboxes del panel.
        const userProfiles = await db.exeQuery(db.getSentence('model', 'listUserProfiles'));
        res.json({ profiles, users, userProfiles });
    } catch (err) {
        console.error('Error en /admin/catalog:', err);
        res.status(500).json({ msg: 'Error al cargar el catálogo.' });
    }
});

// Asigna un perfil a un usuario (inserta en user_profile; ON CONFLICT no duplica).
app.post('/admin/assignProfile', async (req, res) => {
    if (!manageGuard(req, res)) return;
    const { user_id, profile_id } = req.body;
    if (!user_id || !profile_id) {
        return res.status(400).json({ msg: 'Faltan user_id o profile_id.' });
    }
    try {
        await db.exeQuery(db.getSentence('model', 'insertUserProfile'), [Number(user_id), Number(profile_id)]);
        res.json({ msg: 'Perfil asignado.' });
    } catch (err) {
        console.error('Error en /admin/assignProfile:', err);
        res.status(500).json({ msg: 'Error al asignar el perfil.' });
    }
});

// Retira un perfil de un usuario, sin dejarlo nunca sin ningun perfil.
app.post('/admin/unassignProfile', async (req, res) => {
    if (!manageGuard(req, res)) return;
    const { user_id, profile_id } = req.body;
    if (!user_id || !profile_id) {
        return res.status(400).json({ msg: 'Faltan user_id o profile_id.' });
    }
    try {
        const rows = await db.exeQuery(db.getSentence('model', 'countUserProfiles'), [Number(user_id)]);
        if (rows[0].n <= 1) {
            return res.status(400).json({ msg: 'No se puede quitar el último perfil del usuario.' });
        }
        await db.exeQuery(db.getSentence('model', 'deleteUserProfile'), [Number(user_id), Number(profile_id)]);
        res.json({ msg: 'Perfil retirado.' });
    } catch (err) {
        console.error('Error en /admin/unassignProfile:', err);
        res.status(500).json({ msg: 'Error al retirar el perfil.' });
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
            ['model', 'createUserProfile'],
            ['products', 'createProductTable']
        ];
        for (const [schema, id] of ddl) {
            await db.exeQuery(db.getSentence(schema, id));
        }

        const seeds = [
            ['model', 'seedProfile'],
            ['model', 'seedProfileCliente'],
            ['model', 'seedProfileVendedor'],
            ['model', 'seedSubsystem'],
            ['model', 'seedSubsystemProducts'],
            ['model', 'seedObject'],
            ['model', 'seedObjectProduct'],
            ['model', 'seedOptionManage'],
            ['model', 'seedPermAdminManage'],
            ['model', 'seedMethodListUsers'],
            ['model', 'seedMethodInsertUser'],
            ['model', 'seedMethodListProducts'],
            ['model', 'seedMethodInsertProduct'],
            ['model', 'seedPermAdminListUsers'],
            ['model', 'seedPermAdminListProducts'],
            ['model', 'seedPermAdminInsertProduct'],
            ['model', 'seedPermClienteListProducts'],
            ['model', 'seedPermVendedorInsertProduct'],
            ['products', 'seedProduct1'],
            ['products', 'seedProduct2'],
            ['model', 'seedUserAdmin'],
            ['model', 'seedUserCliente'],
            ['model', 'seedUserVendedor'],
            ['model', 'seedUserMixto'],
            ['model', 'seedUserProfileMixto'],
            ['model', 'backfillUserProfile']
        ];
        for (const [schema, id] of seeds) {
            await db.exeQuery(db.getSentence(schema, id));
        }
        console.log('Base de datos lista: tablas y datos demo del modelo de seguridad.');

        // insancia la seguridad y carga los mapas
        const sec = new Security();
        await sec.init();
        global.sec = sec;

        app.listen(config.server.port, () => {
            console.log(`Servidor escuchando en el puerto ${config.server.port}`);
        });
    } catch (err) {
        console.error('Fallo al inicializar la aplicación:', err.message);
        process.exit(1);
    }
})();