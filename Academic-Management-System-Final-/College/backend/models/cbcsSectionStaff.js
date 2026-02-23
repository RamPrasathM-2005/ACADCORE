// models/cbcsSectionStaff.js
import { DataTypes } from "sequelize";

export default (sequelize) => {
  const CBCSSectionStaff = sequelize.define('CBCSSectionStaff', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    cbcs_subject_id: { type: DataTypes.INTEGER, allowNull: false },
    sectionId: { type: DataTypes.INTEGER, allowNull: false },
    staffId: { type: DataTypes.INTEGER },
    student_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { 
    tableName: 'CBCS_Section_Staff', 
    timestamps: false 
  });

  CBCSSectionStaff.associate = (models) => {
    // 1. Association with Subject
    if (models.CBCSSubject) {
        CBCSSectionStaff.belongsTo(models.CBCSSubject, { foreignKey: 'cbcs_subject_id', as: 'subject' });
    }

    // 2. Association with Section
    if (models.Section) {
        CBCSSectionStaff.belongsTo(models.Section, { foreignKey: 'sectionId', as: 'section' });
    }

    // 3. Association with User (Staff) - CRITICAL FIX
    if (models.User) {
        // We add "as: 'staff'" so you can include it easily in controllers
        CBCSSectionStaff.belongsTo(models.User, { foreignKey: 'staffId', as: 'staff' });
    } else {
        console.error("Critical: 'User' model missing when associating CBCSSectionStaff");
    }
  };

  return CBCSSectionStaff;
};