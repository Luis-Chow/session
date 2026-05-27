const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());

app.use(express.json());

app.post('/mi_ruta', (req, res) => {
    const mensajeRecibido = req.body.msg;
    
    console.log(mensajeRecibido);

    if (mensajeRecibido) {
        res.status(200).json({ 
            msg: `Recibí tu "${mensajeRecibido}" correctamente` 
        });
    } else {
        res.status(400).json({ msg: "Error: No hay mensaje." });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});