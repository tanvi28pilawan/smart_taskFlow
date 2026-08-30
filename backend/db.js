
import dotenv from "dotenv";
import pg from "pg";
dotenv.config();
pg.types.setTypeParser(1082, (val) => val); // 1082 = Postgres DATE type OID


const { Pool } = pg;

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "smart_taskflow",
  password: process.env.DB_PASSWORD,
  port: 5432,
});

export default pool;