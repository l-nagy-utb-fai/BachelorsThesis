const { Client } = require('pg'); //Interaction with database

// Function for getting top 5 most used locations
const top5Locations = (app, dbConfig) => {
    app.get('/api/top-locations', async (req, res) => { //Fetching route
        const client = new Client(dbConfig);
        await client.connect();

        try {
            const query = `
                SELECT locations.name, COUNT(records.location_id) AS usage_count
                FROM locations
                LEFT JOIN records ON locations.id = records.location_id
                GROUP BY locations.name
                ORDER BY usage_count DESC
                LIMIT 5
            `;
            const result = await client.query(query);

            res.json(result.rows); // Sends the result as JSON
        } catch (error) {
            console.error('Error fetching top locations from database:', error);
            res.status(500).send({ message: 'An error occurred while fetching locations' });
        } finally {
            await client.end();
        }
    });
};

module.exports = top5Locations;
