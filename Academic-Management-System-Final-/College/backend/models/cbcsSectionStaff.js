// models/cbcsSectionStaff.js
module.exports = (sequelize, DataTypes) => {
  const CBCSSectionStaff = sequelize.define('CBCSSectionStaff', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    cbcs_subject_id: { type: DataTypes.INTEGER, allowNull: false },
    sectionId: { type: DataTypes.INTEGER, allowNull: false },
    staffId: { type: DataTypes.INTEGER },
    student_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { tableName: 'CBCS_Section_Staff', timestamps: false });

  CBCSSectionStaff.associate = (models) => {
    CBCSSectionStaff.belongsTo(models.CBCSSubject, { foreignKey: 'cbcs_subject_id' });
    CBCSSectionStaff.belongsTo(models.Section, { foreignKey: 'sectionId' });
    CBCSSectionStaff.belongsTo(models.User, { foreignKey: 'staffId' });
  };

  return CBCSSectionStaff;
};