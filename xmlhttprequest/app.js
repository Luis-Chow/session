function enviarPeticionXHR(textoAEnviar) {
    const divRespuesta = document.getElementById('respuesta');
    divRespuesta.innerText = "Enviando con XHR...";

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'http://localhost:3000/api/mensaje', true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            const respuestaServidor = JSON.parse(xhr.responseText);
            divRespuesta.innerText = "[XHR] Servidor dice: " + respuestaServidor.mensaje;
        } else {
            divRespuesta.innerText = "[XHR] Error: " + xhr.status;
        }
    };

    xhr.onerror = function() {
        divRespuesta.innerText = "[XHR] Error de conexión.";
    };

    xhr.send(JSON.stringify({ mensaje: textoAEnviar }));
}

function enviarPeticionFetch(textoAEnviar) {
    const divRespuesta = document.getElementById('respuesta');
    divRespuesta.innerText = "Enviando con Fetch...";

    fetch('http://localhost:3000/api/mensaje', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mensaje: textoAEnviar })
    })
    .then(respuesta => {
        if (!respuesta.ok) {
            throw new Error(`Error HTTP: ${respuesta.status}`);
        }
        return respuesta.json(); 
    })
    .then(datos => {
        divRespuesta.innerText = "[Fetch] Servidor dice: " + datos.mensaje;
    })
    .catch(error => {
        divRespuesta.innerText = "[Fetch] Error de conexión: " + error.message;
    });
}

function obtenerTexto() {
    const texto = document.getElementById('inputMensaje').value;
    if (texto.trim() === "") {
        alert("Por favor, escribe un mensaje primero.");
        return null;
    }
    return texto;
}

document.getElementById('btnEnviarXHR').addEventListener('click', () => {
    const texto = obtenerTexto();
    if (texto) enviarPeticionXHR(texto);
});

document.getElementById('btnEnviarFetch').addEventListener('click', () => {
    const texto = obtenerTexto();
    if (texto) enviarPeticionFetch(texto);
});

// Botones predeterminados (Hola Mundo)
document.getElementById('btnHolaXHR').addEventListener('click', () => {
    enviarPeticionXHR("Hola Mundo");
});

document.getElementById('btnHolaFetch').addEventListener('click', () => {
    enviarPeticionFetch("Hola Mundo");
});