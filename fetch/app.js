document.getElementById('btnFetch').addEventListener('click', () => {
    const divRespuesta = document.getElementById('respuesta');
    divRespuesta.innerText = "Enviando solicitud...";

    fetch('http://localhost:3000/mi_ruta', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ msg: "hola mundo" })
    })
    .then(respuesta => {
        if (!respuesta.ok) {
            throw new Error(`Error HTTP: ${respuesta.status}`);
        }
        return respuesta.json(); 
    })
    .then(datos => {
        divRespuesta.innerText = "Servidor responde: " + datos.msg;
    })
    .catch(error => {
        divRespuesta.innerText = "Error de conexión: " + error.message;
    });
});