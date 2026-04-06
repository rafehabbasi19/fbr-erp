'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('company_settings', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      invoice_prefix: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'INV',
      },
      invoice_counter: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: 'Next invoice number to use',
      },
      invoice_format: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: '{PREFIX}-{YYYY}-{NNNN}',
      },
      payment_terms_days: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 30,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('company_settings')
  },
}
