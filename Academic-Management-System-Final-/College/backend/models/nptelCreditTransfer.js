// models/nptelCreditTransfer.js
module.exports = (sequelize, DataTypes) => {
  const NptelCreditTransfer = sequelize.define('NptelCreditTransfer', {
    transferId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    enrollmentId: { type: DataTypes.INTEGER, allowNull: false },
    regno: { type: DataTypes.STRING(50), allowNull: false },
    nptelCourseId: { type: DataTypes.INTEGER, allowNull: false },
    grade: { type: DataTypes.ENUM('O', 'A+', 'A', 'B+', 'B', 'U'), allowNull: false },
    studentStatus: { type: DataTypes.ENUM('pending', 'accepted', 'rejected'), defaultValue: 'pending' },
    studentRespondedAt: { type: DataTypes.DATE, allowNull: true },
    studentRemarks: { type: DataTypes.STRING(500), allowNull: true },
  }, { tableName: 'NptelCreditTransfer', timestamps: true, createdAt: 'requestedAt', updatedAt: false });

  NptelCreditTransfer.associate = (models) => {
    NptelCreditTransfer.belongsTo(models.StudentNptelEnrollment, { foreignKey: 'enrollmentId' });
    NptelCreditTransfer.belongsTo(models.StudentDetails, { foreignKey: 'regno' });
    NptelCreditTransfer.belongsTo(models.NptelCourse, { foreignKey: 'nptelCourseId' });
  };

  return NptelCreditTransfer;
};