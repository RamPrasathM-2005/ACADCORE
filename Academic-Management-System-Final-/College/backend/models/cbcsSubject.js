// models/cbcsSubject.js
export default (sequelize, DataTypes) => {
  const CBCSSubject = sequelize.define('CBCSSubject', {
    cbcs_subject_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    cbcs_id: { type: DataTypes.INTEGER, allowNull: false },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    courseCode: { type: DataTypes.STRING(50) },
    courseTitle: { type: DataTypes.STRING(255) },
    category: { type: DataTypes.STRING(50) },
    type: { type: DataTypes.STRING(50) },
    credits: { type: DataTypes.INTEGER },
    bucketName: { type: DataTypes.STRING(100) },
  }, { 
    tableName: 'CBCS_Subject', 
    timestamps: false 
  });

  CBCSSubject.associate = (models) => {
    CBCSSubject.belongsTo(models.CBCS, { foreignKey: 'cbcs_id' });
    CBCSSubject.belongsTo(models.Course, { foreignKey: 'courseId' });
    CBCSSubject.hasMany(models.CBCSSectionStaff, { foreignKey: 'cbcs_subject_id' });
  };

  return CBCSSubject;
};