import { Config } from "../../models/config.model.js"


export class ConfigController {

    static getConfig = async (req, res, next) => {
        const { orgId } = req.authenticatedService;

        let config = await Config.findOne({ orgId });

        if (!config) {
            return res.status(404).json({ message: "No config found" });
        }

        config = config.toJSON();

        return res.json({ data: config });
    }

    static updateConfig = async (req, res, next) => {
        const { orgId } = req.authenticatedService;

        const updates = req.body;

        await Config.updateOne({ orgId }, { $set: updates }, { upsert: true });

        return res.json({ message: "Updated" });
    }
}