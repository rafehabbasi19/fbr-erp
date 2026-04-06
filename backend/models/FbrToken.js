'use strict'

module.exports = (sequelize, DataTypes) => {
  const FbrToken = sequelize.define(
    'FbrToken',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: false, unique: true },
      // SECURITY: token_encrypted is NEVER returned in API responses
      // Use FbrToken.scope('withToken') only inside fbrService.js
      token_encrypted: { type: DataTypes.TEXT, allowNull: false },
      pos_id: { type: DataTypes.STRING(100), allowNull: false },
      environment: {
        type: DataTypes.ENUM('sandbox', 'production'),
        allowNull: false,
        defaultValue: 'sandbox',
      },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: 'fbr_tokens',
      underscored: true,
      defaultScope: {
        attributes: { exclude: ['token_encrypted'] },
      },
      scopes: {
        withToken: { attributes: {} },
      },
    }
  )

  FbrToken.associate = db => {
    FbrToken.belongsTo(db.Company, { foreignKey: 'company_id', as: 'company' })
  }

  return FbrToken
}
