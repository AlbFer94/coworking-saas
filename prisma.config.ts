import "dotenv/config"; // <--- FONDAMENTALE in Prisma v7 per caricare il file .env
import { defineConfig, env } from '@prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  
  datasource: {
    // Usiamo il DIRECT_URL del tuo .env che serve alla CLI per fare le migrazioni
    url: env('DIRECT_URL'), 
  },
});
