const { AppError } = require('./dbcomponent');

const SEP = '-';
const buildKey = (...parts) => parts.join(SEP);

// Metodos "ricos": funciones de servidor con validacion, valores forzados y transaccion.
// Clave: subsystem.objectName.methodName. Si un metodo NO esta aqui, exeMethod cae al
// comportamiento simple (ejecutar 1 sentencia SQL con los params del cliente).
const businessMethods = {
    'security.User.insertUser': async (ctx) => {
        const { user_na, user_pw } = ctx.params || {};

        // 1) Validacion (antes vivia dentro del endpoint /register).
        const errors = [];
        if (!user_na || user_na.length < 3) errors.push('El usuario debe tener al menos 3 caracteres.');
        if (/\s/.test(user_na || '')) errors.push('El usuario no debe contener espacios.');
        if (!user_pw || user_pw.length < 8) errors.push('La contraseña debe tener al menos 8 caracteres.');
        if ((user_pw || '').length > 64) errors.push('La contraseña no debe superar los 64 caracteres.');
        if (/\s/.test(user_pw || '')) errors.push('La contraseña no debe contener espacios.');
        if (!/[a-z]/.test(user_pw || '')) errors.push('La contraseña debe incluir al menos una letra minúscula.');
        if (!/[A-Z]/.test(user_pw || '')) errors.push('La contraseña debe incluir al menos una letra mayúscula.');
        if (!/[0-9]/.test(user_pw || '')) errors.push('La contraseña debe incluir al menos un número.');
        if (errors.length) throw new AppError(400, 'No se pudo registrar: revisa los requisitos.', errors);

        // 2) Valores forzados por el servidor: toda cuenta nace como Empleado activo.
        //    El cliente NO elige el perfil (evita escalada a Administrador).
        const PROFILE_EMPLEADO = 2;
        const STATUS_ACTIVO = 1;

        // 3) Transaccion: el usuario y su user_profile se crean juntos, o no se crea nada.
        try {
            return await ctx.tx(async (q) => {
                const rows = await q(global.dbc.getSentence('security', 'insertUser'),
                    [user_na, user_pw, PROFILE_EMPLEADO, STATUS_ACTIVO]);
                const newUserId = rows[0].user_id;
                await q(global.dbc.getSentence('model', 'insertUserProfile'), [newUserId, PROFILE_EMPLEADO]);
                return { user_id: newUserId };
            });
        } catch (err) {
            if (err.code === '23505') throw new AppError(409, 'El usuario ya existe.');
            throw err;
        }
    }
    // 👉 Aqui viviran mas adelante insertProject, insertActivity, insertNotification...
};

// Security_Object de la pizarra: cachea los permisos de la BD en Maps.
const Security = class {
    constructor() {
        this.permissionMethodMap = new Map();
        this.permissionOptionMap = new Map();
        this.loadPermissionMethod();
        this.loadPermissionOption();
    }

    // BD -> Map. Key: subsystem_na-object_na-method_na-profile_id, value: true
    async loadPermissionMethod() {
        try {
            const sentence = global.dbc.getSentence('model', 'loadPermissionMethod');
            const rows = await global.dbc.exeQuery(sentence);
            this.permissionMethodMap.clear();
            for (const r of rows) {
                const key = buildKey(r.subsystem_na, r.object_na, r.method_na, r.profile_id);
                this.permissionMethodMap.set(key, true);
            }
            console.log(`Seguridad: ${this.permissionMethodMap.size} permiso(s) de metodo en cache.`);
        } catch (err) {
            console.error('Error en loadPermissionMethod:', err);
        }
    }

    // BD -> Map. Key: subsystem_na-option_na-profile_id, value: true
    async loadPermissionOption() {
        try {
            const sentence = global.dbc.getSentence('model', 'loadPermissionOption');
            const rows = await global.dbc.exeQuery(sentence);
            this.permissionOptionMap.clear();
            for (const r of rows) {
                const key = buildKey(r.subsystem_na, r.option_na, r.profile_id);
                this.permissionOptionMap.set(key, true);
            }
            console.log(`Seguridad: ${this.permissionOptionMap.size} permiso(s) de opcion en cache.`);
        } catch (err) {
            console.error('Error en loadPermissionOption:', err);
        }
    }

    // Consulta el Map (no la BD): ¿el perfil puede ejecutar este metodo?
    getPermissionMethod(j, profile_id) {
        const key = buildKey(j.subsystem, j.objectName, j.methodName, profile_id);
        if (this.permissionMethodMap.has(key)) {
            return this.permissionMethodMap.get(key);
        }
        return false;
    }

    // Consulta el Map: ¿el perfil tiene acceso a esta opcion (de menu)?
    getPermissionOption(j, profile_id) {
        const key = buildKey(j.subsystem, j.optionName, profile_id);
        if (this.permissionOptionMap.has(key)) {
            return this.permissionOptionMap.get(key);
        }
        return false;
    }

    // Ejecuta el metodo solicitado. Si es un metodo "rico" (registrado en businessMethods)
    // corre su funcion de servidor; si no, ejecuta la sentencia SQL con los params (simple).
    async exeMethod(j, session) {
        const key = `${j.subsystem}.${j.objectName}.${j.methodName}`;
        const handler = businessMethods[key];

        if (handler) {
            // Metodo rico: funcion de servidor con su propio contexto.
            return await handler({
                params: j.params,
                session,                                    // quien ejecuta (para auditoria futura)
                tx: (fn) => global.dbc.withTransaction(fn)  // helper de transaccion
            });
        }

        // Metodo simple: comportamiento de siempre (1 sentencia con params del cliente).
        const sentence = global.dbc.getSentence(j.subsystem, j.methodName);
        return await global.dbc.exeQuery(sentence, j.params || []);
    }
};

module.exports = Security;
