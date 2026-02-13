// models/nptelCourse.js
export default  (sequelize, DataTypes) => {
  const NptelCourse = sequelize.define('NptelCourse', {
    nptelCourseId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    courseTitle: { type: DataTypes.STRING(255), allowNull: false },
    courseCode: { type: DataTypes.STRING(50), allowNull: false },
    type: { type: DataTypes.ENUM('OEC', 'PEC'), allowNull: false },
    credits: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    semesterId: { type: DataTypes.INTEGER, allowNull: false },
    isActive: { type: DataTypes.ENUM('YES', 'NO'), defaultValue: 'YES' },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'NptelCourse', timestamps: true });

  NptelCourse.associate = (models) => {
    NptelCourse.belongsTo(models.Semester, { foreignKey: 'semesterId' });
    NptelCourse.hasMany(models.StudentNptelEnrollment, { foreignKey: 'nptelCourseId' });
    NptelCourse.hasMany(models.NptelCreditTransfer, { foreignKey: 'nptelCourseId' });
  };

  return NptelCourse;
};