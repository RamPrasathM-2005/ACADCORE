// models/nptelCreditTransfer.js
export default  (sequelize, DataTypes) => {
  const validGrades = ['O', 'A+', 'A', 'B+', 'B', 'C', 'U'];

  const NptelCreditTransfer = sequelize.define('NptelCreditTransfer', {
    transferId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    enrollmentId: { type: DataTypes.INTEGER, allowNull: false },
    regno: { type: DataTypes.STRING(50), allowNull: false },
    nptelCourseId: { type: DataTypes.INTEGER, allowNull: false },
    grade: { type: DataTypes.STRING(3), allowNull: false, validate: { isIn: [validGrades] } },
    studentStatus: { type: DataTypes.ENUM('pending', 'accepted', 'rejected'), defaultValue: 'pending' },
    studentRespondedAt: { type: DataTypes.DATE, allowNull: true },
    studentRemarks: { type: DataTypes.STRING(500), allowNull: true },
  }, { tableName: 'NptelCreditTransfer', timestamps: true, createdAt: 'requestedAt', updatedAt: false });

  NptelCreditTransfer.associate = (models) => {
    NptelCreditTransfer.belongsTo(models.StudentNptelEnrollment, { foreignKey: 'enrollmentId' });
    NptelCreditTransfer.belongsTo(models.StudentDetails, { foreignKey: 'regno' , targetKey: 'registerNumber'});
    NptelCreditTransfer.belongsTo(models.NptelCourse, { foreignKey: 'nptelCourseId' });
  };

  return NptelCreditTransfer;
};
