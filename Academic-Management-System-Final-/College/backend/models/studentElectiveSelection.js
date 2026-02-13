// models/studentElectiveSelection.js
export default  (sequelize, DataTypes) => {
  const StudentElectiveSelection = sequelize.define('StudentElectiveSelection', {
    selectionId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regno: { type: DataTypes.STRING(50), allowNull: false },
    bucketId: { type: DataTypes.INTEGER, allowNull: false },
    selectedCourseId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'allocated', 'rejected'), defaultValue: 'pending' },
    createdBy: { type: DataTypes.INTEGER },
    updatedBy: { type: DataTypes.INTEGER },
  }, { tableName: 'StudentElectiveSelection', timestamps: true });

  StudentElectiveSelection.associate = (models) => {
    StudentElectiveSelection.belongsTo(models.StudentDetails, { foreignKey: 'regno', targetKey: 'registerNumber' });
    StudentElectiveSelection.belongsTo(models.ElectiveBucket, { foreignKey: 'bucketId' });
    StudentElectiveSelection.belongsTo(models.Course, { foreignKey: 'selectedCourseId' });
    StudentElectiveSelection.belongsTo(models.User, { foreignKey: 'createdBy' });
    StudentElectiveSelection.belongsTo(models.User, { foreignKey: 'updatedBy' });
  };

  return StudentElectiveSelection;
};