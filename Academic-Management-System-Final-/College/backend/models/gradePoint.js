// models/gradePoint.js
module.exports = (sequelize, DataTypes) => {
  const GradePoint = sequelize.define('GradePoint', {
    grade: { type: DataTypes.ENUM('O', 'A+', 'A', 'B+', 'B', 'U'), primaryKey: true },
    point: { type: DataTypes.TINYINT, allowNull: false },
  }, { tableName: 'GradePoint', timestamps: false });

  // Seed
  GradePoint.bulkCreate([
    { grade: 'O', point: 10 },
    { grade: 'A+', point: 9 },
    { grade: 'A', point: 8 },
    { grade: 'B+', point: 7 },
    { grade: 'B', point: 6 },
    { grade: 'U', point: 0 },
  ], { ignoreDuplicates: true });

  return GradePoint;
};