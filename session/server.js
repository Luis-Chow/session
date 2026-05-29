var express = require('express');
var cors = require('cors');
var config = require('./config.json');
var DBComponent = require('./dbcomponent');
var Session = require('./session');
var path = require('path');

var app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

new Session(null, app);

app.use(express.static(path.join(__dirname, 'public')));

const db = new DBComponent();

(async () => {
    try {
        await db.exeQuery(db.getSentence('security', 'createUserTable'));
        console.log('Base de datos lista. Tabla users verificada.');
    } catch (err) {
        console.error('Error al inicializar la base de datos:', err.message);
    }
})();

app.post('/register', async (req, res) => {
    const { user_na, user_pw, profile_id = 1, status_id = 1 } = req.body;
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
        res.status(201).json({ msg: 'Usuario creado.', user_id: rows[0].user_id });
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
        const ses = new Session(req);
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
        const ses = new Session(req);
        await ses.logout();
        res.clearCookie('connect.sid');
        res.json({ msg: 'Sesión cerrada.' });
    } catch (err) {
        res.status(500).json({ msg: 'Error al cerrar sesión.' });
    }
});

app.get('/me', (req, res) => {
    const ses = new Session(req);
    if (!ses.sessionExist()) {
        return res.status(401).json({ msg: 'No hay sesión activa.' });
    }
    res.json({ objectSession: ses.getDataSession() });
});

app.get('/privado', (req, res) => {
    const ses = new Session(req);
    if (!ses.sessionExist()) {
        return res.status(401).json({ msg: 'No autorizado. Inicia sesión primero.' });
    }
    const data = ses.getDataSession();
    res.json({
        msg: `Hola ${data.user_na}, esta es una ruta privada.`,
        objectSession: data
    });
});

app.listen(config.server.port, () => {
    console.log(`Servidor escuchando en el puerto ${config.server.port}`);
});
