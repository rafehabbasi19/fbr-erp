'use strict'

module.exports = (sequelize, DataTypes) => {
  const CsvUploadError = sequelize.define(
    'CsvUploadError',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      upload_id: { type: DataTypes.UUID, allowNull: false },
      row_number: { type: DataTypes.INTEGER, allowNull: false },
      field: { type: DataTypes.STRING(100), allowNull: true },
      error_message: { type: DataTypes.TEXT, allowNull: false },
    },
    { tableName: 'csv_upload_errors', underscored: true, updatedAt: false }
  )

  CsvUploadError.associate = db => {
    CsvUploadError.belongsTo(db.CsvUpload, { foreignKey: 'upload_id', as: 'upload' })
  }

  return CsvUploadError
}
