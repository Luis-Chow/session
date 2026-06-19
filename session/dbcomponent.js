const { Pool } = require('pg');
const config = require('./config.json');
const sentences = require('./sentences.json');

// Error de negocio: lleva el status HTTP que el dispatcher debe responder.
class AppError extends Error {
    constructor(status, msg, errors) {
        super(msg);
        this.name = 'AppError';
        this.status = status;   // 400, 409, ...
        this.errors = errors;   // detalle opcional (lista de validaciones)
    }
}

class DBComponent {
    constructor() {
        if (DBComponent.instance) {
            return DBComponent.instance;
        }

        this.pool = new Pool({
            host: config.db.host,
            database: config.db.database,
            user: config.db.user,
            password: config.db.password,
            port: config.db.port,
            ssl: config.db.ssl,
            max: config.db.max,
            idleTimeoutMillis: config.db.idleTimeoutMillis,
            connectionTimeoutMillis: config.db.connectionTimeoutMillis,
            maxUses: config.db.maxUses
        });

        DBComponent.instance = this;
    }

    getSentence(schema, sentenceId) {
        if (!sentences[schema] || !sentences[schema][sentenceId]) {
            throw new Error(`Sentence no encontrada: ${schema}.${sentenceId}`);
        }
        return sentences[schema][sentenceId];
    }

    async exeQuery(sentence, params = []) {
        const cnn = await this.pool.connect();
        try {
            const result = await cnn.query(sentence, params);
            return result.rows;
        } finally {
            cnn.release();
        }
    }

    // Ejecuta varias sentencias en UNA transaccion: o todas, o ninguna (rollback).
    // fn recibe q(sentence, params) -> filas, que corre sobre la MISMA conexion.
    async withTransaction(fn) {
        const cnn = await this.pool.connect();
        try {
            await cnn.query('BEGIN');
            const q = (sentence, params = []) => cnn.query(sentence, params).then((r) => r.rows);
            const result = await fn(q);
            await cnn.query('COMMIT');
            return result;
        } catch (err) {
            await cnn.query('ROLLBACK');   // si algo falla, deshace TODO
            throw err;
        } finally {
            cnn.release();
        }
    }
}

module.exports = DBComponent;
module.exports.AppError = AppError;