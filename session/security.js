const SEP = '-';
const buildKey = (...parts) => parts.join(SEP);

class Security {
    constructor() {
        this.permissionMethodMap = new Map();
        this.permissionOptionMap = new Map();
    }

    async init() {
        await this.loadPermissionMethod();
        await this.loadPermissionOption();
    }

    // Trae todos los permisos de metodos y los guarda en permissionMethodMap
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
            throw err;
        }
    }

    // Trae todos los permisos de opciones y los guarda en permissionOptionMap
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
            throw err;
        }
    }

    // Obtiene los permisos de metodo por perfil del map
    getPermissionMethod(j, profileIds) {
        for (const profile_id of profileIds) {
            const key = buildKey(j.subsystem, j.objectName, j.methodName, profile_id);
            if (this.permissionMethodMap.get(key) === true) {
                return true;
            }
        }
        return false;
    }

    // Obtiene el perfil de los permisos de metodo y obtiene los metodos permitidos por perfil del map
    getAllowedMethods(profileIds) {
        const allowed = new Set();
        for (const key of this.permissionMethodMap.keys()) {
            const parts = key.split(SEP);
            const profile_id = Number(parts[parts.length - 1]);
            if (profileIds.includes(profile_id)) {
                allowed.add(parts.slice(0, -1).join(SEP));
            }
        }
        return [...allowed];
    }

    // Obtiene los permisos de opcion por perfil del map
    getPermissionOption(j, profileIds) {
        for (const profile_id of profileIds) {
            const key = buildKey(j.subsystem, j.optionName, profile_id);
            if (this.permissionOptionMap.get(key) === true) {
                return true;
            }
        }
        return false;
    }

    // Otorga un permiso de metodo y actualiza el mapa
    async setPermissionMethod(profile_id, method_id) {
        try {
            const sentence = global.dbc.getSentence('model', 'insertPermissionMethod');
            await global.dbc.exeQuery(sentence, [profile_id, method_id]);
            await this.loadPermissionMethod();
        } catch (err) {
            console.error('Error en setPermissionMethod:', err);
            throw err;
        }
    }

    // Otorga un permiso de opcion y actualiza el mapa
    async setPermissionOption(profile_id, option_id) {
        try {
            const sentence = global.dbc.getSentence('model', 'insertPermissionOption');
            await global.dbc.exeQuery(sentence, [profile_id, option_id]);
            await this.loadPermissionOption();
        } catch (err) {
            console.error('Error en setPermissionOption:', err);
            throw err;
        }
    }

    // Busca la sentencia por subsistema y metodo, y la ejecuta con los parametros dados.
    async exeMethod(j) {
        try {
            const sentence = global.dbc.getSentence(j.subsystem, j.methodName);
            return await global.dbc.exeQuery(sentence, j.params || []);
        } catch (err) {
            console.error('Error en exeMethod:', err);
            throw err;
        }
    }
}

module.exports = Security;