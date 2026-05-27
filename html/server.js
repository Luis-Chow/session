const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.use(express.urlencoded({ extended: true })); 

app.post('/api/clasico', (req, res) => {
    
    const mensaje = req.body.textoDelUsuario;
    
    console.log("Formulario clásico recibido con mensaje:", mensaje);

    const paginaHTMLRespuesta = `
        <!DOCTYPE html>
        <html>
        <head><title>Respuesta del Servidor</title></head>
        <body style="background: #1e1e1e; color: white; text-align: center; padding: 50px; font-family: sans-serif;">
            <h1>¡El servidor procesó tu formulario!</h1>
            <p>Me enviaste este texto: <strong>"${mensaje}"</strong></p>
            <br>
            <a href="http://127.0.0.1:5500/clasico.html" style="color: #64b5f6;">Volver a la página anterior</a>
        </body>
        </html>
    `;

    res.status(200).send(paginaHTMLRespuesta);
});

app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));