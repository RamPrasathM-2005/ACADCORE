// models/studentNptelEnrollment.js
module.exports = (sequelize, DataTypes) => {
  const StudentNptelEnrollment = sequelize.define('StudentNptelEnrollment', {
    enrollmentId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regno: { type: DataTypes.STRING(50), allowNull: false },
    nptelCourseId: { type: DataTypes.INTEGER, allowNull: false },
    semesterId: { type: DataTypes.INTEGER, allowNull: false },
    isActive: { type: DataTypes.ENUM('YES', 'NO'), defaultValue: 'YES' },
  }, { tableName: 'StudentNptelEnrollment', timestamps: true, createdAt: 'enrolledAt', updatedAt: false });

  StudentNptelEnrollment.associate = (models) => {
    StudentNptelEnrollment.belongsTo(models.StudentDetails, { foreignKey: 'regno' });
    StudentNptelEnrollment.belongsTo(models.NptelCourse, { foreignKey: 'nptelCourseId' });
    StudentNptelEnrollment.belongsTo(models.Semester, { foreignKey: 'semesterId' });
    StudentNptelEnrollment.hasOne(models.NptelCreditTransfer, { foreignKey: 'enrollmentId' });
  };

  return StudentNptelEnrollment;
};