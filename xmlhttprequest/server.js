const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.post('/api/mensaje', (req, res) => {
    const mensajeRecibido = req.body.mensaje;
    
    console.log("Mensaje recibido del cliente:", mensajeRecibido);

    if (mensajeRecibido) {
        res.status(200).json({ 
            mensaje: `He recibido tu mensaje: "${mensajeRecibido}"` 
        });
    } else {
        res.status(400).json({ mensaje: "Error: No se envió ningún mensaje." });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});