// src/db.js
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    logging: false,
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    timezone: '+05:30'
  }
);

export const branchMap = {
  CSE: { Deptid: 1, Deptname: "Computer Science Engineering" },
  IT: { Deptid: 4, Deptname: "Information Technology" },
  ECE: { Deptid: 2, Deptname: "Electronics & Communication" },
  MECH: { Deptid: 3, Deptname: "Mechanical Engineering" },
  CIVIL: { Deptid: 7, Deptname: "Civil Engineering" },
  EEE: { Deptid: 5, Deptname: "Electrical Engineering" },
};


export default sequelize;