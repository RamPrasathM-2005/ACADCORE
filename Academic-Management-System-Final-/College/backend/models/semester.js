// models/semester.js
module.exports = (sequelize, DataTypes) => {
  const Semester = sequelize.define('Semester', {
    semesterId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    batchId: { type: DataTypes.INTEGER, allowNull: false },
    semesterNumber: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 8 } },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    isActive: { type: DataTypes.ENUM('YES', 'NO'), defaultValue: 'YES' },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'Semester', timestamps: true, createdAt: 'createdDate', updatedAt: 'updatedDate' });

  Semester.associate = (models) => {
    Semester.belongsTo(models.Batch, { foreignKey: 'batchId' });
    Semester.hasMany(models.Course, { foreignKey: 'semesterId' });
    Semester.hasMany(models.Timetable, { foreignKey: 'semesterId' });
    Semester.hasMany(models.ElectiveBucket, { foreignKey: 'semesterId' });
    Semester.hasMany(models.NptelCourse, { foreignKey: 'semesterId' });
    Semester.hasMany(models.StudentSemesterGPA, { foreignKey: 'semesterId' });
    Semester.hasMany(models.CBCS, { foreignKey: 'semesterId' });
  };

  return Semester;
};