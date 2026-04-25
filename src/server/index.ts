import { loadConfig } from '../config';
import { buildApp } from './app';

const config = loadConfig();
const app = buildApp(config);

app.listen({ port: config.port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`curve-zenmoney-sync listening on port ${config.port}`);
});
