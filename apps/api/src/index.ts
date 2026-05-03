// ESM
import Fastify from 'fastify'

const fastify = Fastify({
    logger: true
})

fastify.get('/', async (request, reply) => {
    return { hello: 'world' }
})


fastify.get('/health', async (request, reply) => {
    return{
        "postgres": "ok",
        "redis": "ok",
        "storage": "ok"
    }
});


fastify.post("/transfers", async (request, reply) => {
    // This endpoints creates a transfer session
//     Client requests new transfer
// → backend generates transfer code
// → backend generates object key
// → backend stores metadata in Postgres
// → backend returns transfer info


    // Accepts metadata
    // Set expiration
    // Creation upload session
    // return retrival code


})

/**
 * Run the server!
 */
const start = async () => {
    try {
        await fastify.listen({ port: 3001 })
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}
start()