const SEP = '-';
const buildKey = (...parts) => parts.join(SEP);

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

    // Otorga un permiso de metodo en la BD y refresca el Map.
    async setPermissionMethod(profile_id, method_id) {
        const sentence = global.dbc.getSentence('model', 'insertPermissionMethod');
        await global.dbc.exeQuery(sentence, [profile_id, method_id]);
        await this.loadPermissionMethod();
    }

    // Otorga un permiso de opcion en la BD y refresca el Map.
    async setPermissionOption(profile_id, option_id) {
        const sentence = global.dbc.getSentence('model', 'insertPermissionOption');
        await global.dbc.exeQuery(sentence, [profile_id, option_id]);
        await this.loadPermissionOption();
    }

    // Busca la sentencia por subsistema y metodo, y la ejecuta con sus parametros.
    async exeMethod(j) {
        const sentence = global.dbc.getSentence(j.subsystem, j.methodName);
        return await global.dbc.exeQuery(sentence, j.params || []);
    }
};

module.exports = Security;
