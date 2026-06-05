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

// --- Constantes: un solo lugar para valores que antes estaban dispersos/hardcodeados ---
const DEFAULT_PROFILE_ID = 2;   // 'Cliente': perfil estandar para auto-registro (NO admin)
const DEFAULT_STATUS_ID = 1;    // 1 = activo
const USER_MIN = 3, PW_MIN = 8, PW_MAX = 64;   // reglas de validacion del registro
const MSG_MISSING_CREDENTIALS = 'Falta usuario o contraseña.';
// Opcion que habilita el panel de gestion de permisos (solo el Admin la tiene).
const MANAGE_OPTION = { subsystem: 'security', optionName: 'managePermissions' };
// Perfiles del usuario para el chequeo (muchos-a-muchos), con respaldo al profile_id unico.
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
        // Registra el perfil del usuario en el modelo muchos-a-muchos (user_profile).
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

// --- Panel de Admin: gestion de permisos en caliente ---
// Verifica que el usuario tenga la opcion managePermissions (usa getPermissionOption).
// Devuelve los perfiles si pasa, o null si ya respondio con 401/403.
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

// Catalogo para poblar los desplegables del panel (perfiles, metodos, opciones).
app.get('/admin/catalog', async (req, res) => {
    if (!manageGuard(req, res)) return;
    try {
        const profiles = await db.exeQuery(db.getSentence('model', 'listProfiles'));
        const methods = await db.exeQuery(db.getSentence('model', 'listMethods'));
        const options = await db.exeQuery(db.getSentence('model', 'listOptions'));
        res.json({ profiles, methods, options });
    } catch (err) {
        console.error('Error en /admin/catalog:', err);
        res.status(500).json({ msg: 'Error al cargar el catálogo.' });
    }
});

// Otorga un permiso de metodo a un perfil (usa setPermissionMethod: BD + refresca cache).
app.post('/admin/grantMethod', async (req, res) => {
    if (!manageGuard(req, res)) return;
    const { profile_id, method_id } = req.body;
    if (!profile_id || !method_id) {
        return res.status(400).json({ msg: 'Faltan profile_id o method_id.' });
    }
    try {
        await global.sec.setPermissionMethod(Number(profile_id), Number(method_id));
        res.json({ msg: 'Permiso de método otorgado.' });
    } catch (err) {
        console.error('Error en /admin/grantMethod:', err);
        res.status(500).json({ msg: 'Error al otorgar el permiso.' });
    }
});

// Otorga un permiso de opcion a un perfil (usa setPermissionOption: BD + refresca cache).
app.post('/admin/grantOption', async (req, res) => {
    if (!manageGuard(req, res)) return;
    const { profile_id, option_id } = req.body;
    if (!profile_id || !option_id) {
        return res.status(400).json({ msg: 'Faltan profile_id o option_id.' });
    }
    try {
        await global.sec.setPermissionOption(Number(profile_id), Number(option_id));
        res.json({ msg: 'Permiso de opción otorgado.' });
    } catch (err) {
        console.error('Error en /admin/grantOption:', err);
        res.status(500).json({ msg: 'Error al otorgar el permiso.' });
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
            ['model', 'seedOptionExport'],
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