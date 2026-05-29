const session = require('express-session');
const config = require('./config.json');
const DBComponent = require('./dbcomponent');

class Session {
    constructor(request, app) {
        this.req = request;

        if (app) {
            app.use(session({
                secret: config.session.secret,
                resave: config.session.resave,
                saveUninitialized: config.session.saveUninitialized,
                cookie: config.session.cookie
            }));
        }

        this.db = new DBComponent();
    }

    sessionExist() {
        if (this.req && this.req.session && this.req.session.objectSession) {
            return true;
        }
        return false;
    }

    async authenticate(user_na, user_pw) {
        const sentence = this.db.getSentence('security', 'getUser');
        const rows = await this.db.exeQuery(sentence, [user_na, user_pw]);
        if (rows.length === 0) return null;
        return rows[0];
    }

    async createSession(user_na) {
        const sentence = this.db.getSentence('security', 'getDataSession');
        const rows = await this.db.exeQuery(sentence, [user_na]);
        if (rows.length === 0) return false;

        const user = rows[0];
        this.req.session.objectSession = {
            user_id: user.user_id,
            user_na: user.user_na,
            profile_id: user.profile_id,
            status_id: user.status_id,
            person_id: user.person_id
        };
        return true;
    }

    destroySession() {
        return new Promise((resolve, reject) => {
            this.req.session.destroy((err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    getDataSession() {
        if (!this.sessionExist()) return null;
        return this.req.session.objectSession;
    }

    async login(user_na, user_pw) {
        const user = await this.authenticate(user_na, user_pw);
        if (!user) {
            return { ok: false, msg: 'Credenciales inválidas.' };
        }
        await this.createSession(user_na);
        return { ok: true, data: this.getDataSession() };
    }

    async logout() {
        await this.destroySession();
        return { ok: true };
    }
}

module.exports = Session;
