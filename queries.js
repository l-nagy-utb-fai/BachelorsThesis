const { Client } = require('pg'); //Interaction with database

// Function for getting top 5 most used locations
const top5Locations = (app, dbConfig) => {
    app.get('/api/top-locations', async (req, res) => { //Fetching route
        const client = new Client(dbConfig);
        await client.connect();

        try {
            // First, get the total count of records
            const totalRecordsQuery = 'SELECT COUNT(*) AS total FROM records';
            const totalRecordsResult = await client.query(totalRecordsQuery);
            const totalRecords = parseInt(totalRecordsResult.rows[0].total, 10);

            const query = `
                SELECT locations.name, 
                    COUNT(records.location_id) AS usage_count,
                    ROUND((COUNT(records.location_id) * 100.0 / $1), 2) AS usage_percentage
                FROM locations
                LEFT JOIN records ON locations.id = records.location_id
                                WHERE locations.anonymized IS NOT TRUE  -- Exclude anonymized locations
                GROUP BY locations.name
                ORDER BY usage_count DESC
                LIMIT 5
            `;
            const result = await client.query(query, [totalRecords]);

            res.json(result.rows); // Sends the result as JSON
        } catch (error) {
            console.error('Error fetching top locations from database:', error);
            res.status(500).send({ message: 'An error occurred while fetching locations' });
        } finally {
            await client.end();
        }
    });
};

// Function for getting first and last record each year
const firstLastYear = (app, dbConfig) => {
    app.get('/api/yearly-first-last', async (req, res) => { //Fetching route
        const client = new Client(dbConfig);
        await client.connect();

        try {
            const query = `
                WITH yearly_records AS (
                    SELECT 
                        EXTRACT(YEAR FROM timestamp) AS year,
                        id,
                        timestamp
                    FROM records
                ),
                first_records AS (
                    SELECT DISTINCT ON (year) 
                        year, 
                        id AS first_record_id, 
                        timestamp AS first_record_timestamp
                    FROM yearly_records
                    ORDER BY year, timestamp ASC
                ),
                last_records AS (
                    SELECT DISTINCT ON (year) 
                        year, 
                        id AS last_record_id, 
                        timestamp AS last_record_timestamp
                    FROM yearly_records
                    ORDER BY year, timestamp DESC
                )
                SELECT 
                    f.year,
                    f.first_record_id,
                    f.first_record_timestamp,
                    l.last_record_id,
                    l.last_record_timestamp
                FROM first_records f
                JOIN last_records l ON f.year = l.year
                ORDER BY f.year;
            `;
            const result = await client.query(query);
            res.json(result.rows); // Sends the result as JSON
        } catch (error) {
            console.error('Error fetching yearly records:', error);
            res.status(500).send({ message: 'An error occurred while fetching yearly records' });
        } finally {
            await client.end();
        }
    });
};

const earliestLatestHour = (app, dbConfig) => {
    app.get('/api/earliest-latest-finding', async (req, res) => {
        const client = new Client(dbConfig);
        await client.connect();

        try {
            const earliestQuery = `
                SELECT id, timestamp
                FROM records
                WHERE TO_CHAR(timestamp, 'HH24:MI:SS') = (
                    SELECT MIN(TO_CHAR(timestamp, 'HH24:MI:SS')) FROM records
                );
            `;

            const latestQuery = `
                SELECT id, timestamp
                FROM records
                WHERE TO_CHAR(timestamp, 'HH24:MI:SS') = (
                    SELECT MAX(TO_CHAR(timestamp, 'HH24:MI:SS')) FROM records
                );
            `;

            // Execute queries
            const earliestResult = await client.query(earliestQuery);
            const latestResult = await client.query(latestQuery);

            const earliest = earliestResult.rows[0];
            const latest = latestResult.rows[0];

            res.json({
                earliest: { 
                    id: earliest.id, 
                    timestamp: earliest.timestamp,
                },
                latest: { 
                    id: latest.id,
                    timestamp: latest.timestamp,
                },
            });
        } catch (error) {
            console.error('Error fetching earliest and latest findings:', error);
            res.status(500).send({ message: 'An error occurred while fetching earliest and latest findings' });
        } finally {
            await client.end();
        }
    });
};

const mostInDay = (app, dbConfig) => {
    app.get('/api/day-most-findings', async (req, res) => {
        const client = new Client(dbConfig);
        await client.connect();

        try {
            // Query for the day with the most findings
            const dayQuery = `
                SELECT DATE(timestamp) AS date, COUNT(*) AS count
                FROM records
                GROUP BY DATE(timestamp)
                ORDER BY count DESC
                LIMIT 1;
            `;

            // Execute the queries
            const dayResult = await client.query(dayQuery);

            const dayWithMostFindings = dayResult.rows[0];

            res.json({
                dayWithMostFindings: {
                    date: dayWithMostFindings.date,
                    count: dayWithMostFindings.count
                },
            });
        } catch (error) {
            console.error('Error fetching day and hour with most findings:', error);
            res.status(500).send({ message: 'An error occurred while fetching findings' });
        } finally {
            await client.end();
        }
    });
};

const byYear = (app, dbConfig) => {
    app.get('/api/findings-by-year', async (req, res) => {
        const client = new Client(dbConfig);
        await client.connect();

        try {
            const query = `
                SELECT EXTRACT(YEAR FROM records.timestamp) AS year, 
                       COUNT(*) AS total_findings
                FROM records
                GROUP BY year
                ORDER BY year ASC;
            `;
            const result = await client.query(query);

            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching yearly findings:', error);
            res.status(500).send({ message: 'An error occurred while fetching yearly findings' });
        } finally {
            await client.end();
        }
    });
};

const byMonth = (app, dbConfig) => {
    app.get('/api/findings-by-month', async (req, res) => {
        const client = new Client(dbConfig);
        await client.connect();

        try {
            const query = `
                SELECT EXTRACT(MONTH FROM records.timestamp) AS month, 
                       COUNT(*) AS total_findings
                FROM records
                GROUP BY month
                ORDER BY month ASC;
            `;
            const result = await client.query(query);

            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching monthly findings:', error);
            res.status(500).send({ message: 'An error occurred while fetching monthly findings' });
        } finally {
            await client.end();
        }
    });
};

const byDay = (app, dbConfig) => {
    app.get('/api/findings-by-day', async (req, res) => {
        const client = new Client(dbConfig);
        await client.connect();

        try {
            const query = `
                SELECT 
                    (EXTRACT(DOW FROM records.timestamp) + 6) % 7 + 1 AS day_of_week,
                    COUNT(*) AS total_findings
                FROM records
                GROUP BY day_of_week
                ORDER BY day_of_week ASC;
            `;
            const result = await client.query(query);

            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching findings by day of the week:', error);
            res.status(500).send({ message: 'An error occurred while fetching findings by day' });
        } finally {
            await client.end();
        }
    });
};

const byHour = (app, dbConfig) => {
    app.get('/api/findings-by-hour', async (req, res) => {
        const client = new Client(dbConfig);
        await client.connect();

        try {
            const query = `
                SELECT EXTRACT(HOUR FROM timestamp) AS hour_of_day, 
                    COUNT(*) AS total_findings
                FROM records
                GROUP BY hour_of_day
                ORDER BY hour_of_day ASC;
            `;
            const result = await client.query(query);

            // Return the result as a JSON response
            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching findings by hour:', error);
            res.status(500).send({ message: 'An error occurred while fetching findings by hour' });
        } finally {
            await client.end();
        }
    });
};

const mostInHour = (app, dbConfig) => {
    app.get('/api/hour-most-findings', async (req, res) => {
        const client = new Client(dbConfig);
        await client.connect();

        try {
            const query = `
                SELECT 
                    DATE(timestamp) AS date_of_day,
                    EXTRACT(HOUR FROM timestamp) AS hour_of_day, 
                    COUNT(*) AS total_findings
                FROM records
                GROUP BY date_of_day, hour_of_day
                ORDER BY total_findings DESC
                LIMIT 1;
            `;
            const result = await client.query(query);

            // Return the result as a JSON response
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error fetching most productive hour:', error);
            res.status(500).send({ message: 'An error occurred while fetching most productive hour' });
        } finally {
            await client.end();
        }
    });
};

module.exports = { top5Locations, firstLastYear, earliestLatestHour, mostInDay, byYear, byMonth, byDay, byHour, mostInHour};
