const { Pool } = require('pg');
const config = require('./config.json');
const sentences = require('./sentences.json');

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

    async connect() {
        return await this.pool.connect();
    }

    async exeQuery(sentence, params = []) {
        const cnn = await this.connect();
        try {
            const result = await cnn.query(sentence, params);
            return result.rows;
        } finally {
            cnn.release();
        }
    }
}

module.exports = DBComponent;