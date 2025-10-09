import jwt from 'jsonwebtoken'
import fs from "fs"
import axios from "axios";

const publicKey = fs.readFileSync(process.env.PUBLIC_KEY_PATH, 'utf8');
const serviceKey = process.env.SERVICE_KEY;


export const authenticateService = () => async (req, res, next) => {
    try {
        const apiKey = req.headers["x-api-key"];
        const authToken = req.header('Authorization') || req.query.token;
        const serviceApiKey = req.headers['service-api-key'];

        if (apiKey) {
            try {
            const response = await axios.get(`${process.env.AUTH_SERVICE_URL}/api/org/apikey/validate`, {
                    headers: { "x-api-key": apiKey },
                });
                const { success, org } = response.data.data;

                if (!success) {
                    return res.status(401).json({ error: "Invalid authentication credentials" });
                }

                req.authenticatedService = {
                    orgId: org._id,
                    email: `support+${org.name}@snapsec.co`
                };
                return next();
            } catch (error) {
                console.error(error);
                return res.status(500).json({ error: "Internal server error during API key validation" });
            }
        }

        if (authToken) {
            const token = authToken.split(' ')[1] || authToken;
            const decodedToken = jwt.verify(token, publicKey, { algorithms: ['RS256'] });

            if (decodedToken.licenceExpiry && new Date(decodedToken.licenceExpiry) < new Date()) {
                return res.status(401).json({ error: "Licence has expired" });
            }

            if (decodedToken.orgAccess && !decodedToken.orgAccess.includes("ASM")) {
                return res.status(401).json({ error: "You do not have access to SnapSec ASM" });
            }

            req.authenticatedService = decodedToken;
            return next();
        }

        if (serviceApiKey === serviceKey) {
            return next();
        }

        return res.status(401).json({ message: 'Authentication token is missing' });
    } catch (error) {
        console.error('Error during authentication:', error);
        return res.status(401).json({ message: 'Authentication failed', error: error.message });
    }
};