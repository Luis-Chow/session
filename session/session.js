const session = require('express-session');
const config = require('./config.json');

class Session {
    static initMiddleware(app) {
        if (!app) {
            console.warn('Session.initMiddleware: no se recibió la instancia de "app"; el middleware de sesión no fue inicializado.');
            return;
        }
        app.use(session({
            name: config.session.name,
            secret: config.session.secret,
            resave: config.session.resave,
            saveUninitialized: config.session.saveUninitialized,
            cookie: config.session.cookie
        }));
    }

    constructor(req, db) {
        this.req = req;
        this.db = db;
    }

    sessionExist() {
        if (this.req && this.req.session && this.req.session.objectSession) {
            return true;
        }
        return false;
    }

    async authenticate(user_na, user_pw) {
        try {
            const sentence = this.db.getSentence('security', 'getUser');
            const rows = await this.db.exeQuery(sentence, [user_na, user_pw]);
            if (rows.length === 0) return null;
            return rows[0];
        } catch (err) {
            console.error('Error en authenticate:', err);
            throw err;
        }
    }

    async createSession(user) {
        try {
            const profSentence = this.db.getSentence('model', 'getUserProfiles');
            const profRows = await this.db.exeQuery(profSentence, [user.user_id]);
            const profiles = profRows.length
                ? profRows.map(r => r.profile_id)
                : [user.profile_id];

            this.req.session.objectSession = {
                "user_id": user.user_id,
                "user_na": user.user_na,
                "profile_id": user.profile_id,
                "status_id": user.status_id,
                "person_id": user.person_id,
                "profiles": profiles
            };
            return true;
        } catch (err) {
            console.error('Error en createSession:', err);
            throw err;
        }
    }

    destroySession() {
        return new Promise((resolve, reject) => {
            try {
                this.req.session.destroy((err) => {
                    if (err) return reject(err);
                    resolve();
                });
            } catch (err) {
                console.error('Error en destroySession:', err);
                reject(err);
            }
        });
    }

    getDataSession() {
        try {
            if (!this.sessionExist()) return null;
            return this.req.session.objectSession;
        } catch (err) {
            console.error('Error en getDataSession:', err);
            return null;
        }
    }

    async login(user_na, user_pw) {
        try {
            const user = await this.authenticate(user_na, user_pw);
            if (!user) {
                return { "ok": false, "msg": 'Credenciales inválidas.' };
            }
            await this.createSession(user);
            return { "ok": true, "data": this.getDataSession() };
        } catch (err) {
            console.error('Error en login:', err);
            return { "ok": false, "msg": 'Error interno del servidor.' };
        }
    }

    async logout() {
        try {
            await this.destroySession();
            return { "ok": true };
        } catch (err) {
            console.error('Error en logout:', err);
            return { "ok": false, "msg": 'Error al cerrar sesión.' };
        }
    }
}

module.exports = Session;