import dotenv from 'dotenv';
import { OpenMsgSettings } from '../type';

dotenv.config();

const settings: OpenMsgSettings = {
    openmsgDomain: process.env.OPENMSG_DOMAIN || "enter_your_domain_in_settings_file.com",
    sandbox: process.env.SANDBOX === 'true',
    sandboxDir: process.env.SANDBOX === 'true' ? "/sandbox" : "",
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development'
};

export default settings; 