'use strict'

module.exports = (sequelize, DataTypes) => {
  const CsvUpload = sequelize.define(
    'CsvUpload',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: false },
      filename: { type: DataTypes.STRING(255), allowNull: false },
      original_name: { type: DataTypes.STRING(255), allowNull: false },
      row_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      valid_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      error_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: {
        type: DataTypes.ENUM('processing', 'ready', 'errors', 'submitted'),
        allowNull: false,
        defaultValue: 'processing',
      },
      uploaded_by: { type: DataTypes.UUID, allowNull: true },
    },
    { tableName: 'csv_uploads', underscored: true, updatedAt: false }
  )

  CsvUpload.associate = db => {
    CsvUpload.belongsTo(db.Company, { foreignKey: 'company_id', as: 'company' })
    CsvUpload.belongsTo(db.User, { foreignKey: 'uploaded_by', as: 'uploader' })
    CsvUpload.hasMany(db.CsvUploadError, { foreignKey: 'upload_id', as: 'errors' })
  }

  return CsvUpload
}
