import {readFile,writeFile} from 'node:fs/promises';
import {generatePublicFeedbackMariaSql} from '../lib/forms/public-feedback-schema.mjs';

const source=await readFile(new URL('../drizzle/0154_native_public_feedback_defaults.sql',import.meta.url),'utf8');
const generated=generatePublicFeedbackMariaSql(source);
await writeFile(new URL('../deployment/babal/mariadb-native-public-feedback-defaults.sql',import.meta.url),generated);
console.log('Generated source-derived native public feedback defaults; no database was opened.');
