'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.renameColumn('tax_rates', 'label', 'name')
    await queryInterface.renameColumn('tax_rates', 'rate', 'rate_percentage')

    await queryInterface.addColumn('tax_rates', 'tax_type', {
      type: Sequelize.ENUM('GST', 'SalesTax', 'WHT', 'Exempt', 'ZeroRated'),
      allowNull: false,
      defaultValue: 'GST',
    })

    await queryInterface.addColumn('tax_rates', 'description', {
      type: Sequelize.STRING(255),
      allowNull: true,
    })

    await queryInterface.addIndex('tax_rates', ['company_id'], {
      name: 'tax_rates_single_default_per_company_idx',
      unique: true,
      where: { is_default: true },
    })

    await queryInterface.addIndex('tax_rates', ['company_id', 'is_active'], {
      name: 'tax_rates_company_active_idx',
    })

    await queryInterface.createTable('tax_exemptions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      client_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      exemption_type: {
        type: Sequelize.ENUM('full', 'partial'),
        allowNull: false,
        defaultValue: 'full',
      },
      certificate_number: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      valid_from: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      valid_until: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
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

    await queryInterface.addIndex('tax_exemptions', ['company_id'], {
      name: 'tax_exemptions_company_idx',
    })
    await queryInterface.addIndex('tax_exemptions', ['client_id'], {
      name: 'tax_exemptions_client_idx',
    })
    await queryInterface.addIndex('tax_exemptions', ['company_id', 'client_id'], {
      name: 'tax_exemptions_company_client_idx',
    })
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('tax_exemptions', 'tax_exemptions_company_client_idx')
    await queryInterface.removeIndex('tax_exemptions', 'tax_exemptions_client_idx')
    await queryInterface.removeIndex('tax_exemptions', 'tax_exemptions_company_idx')
    await queryInterface.dropTable('tax_exemptions')

    await queryInterface.removeIndex('tax_rates', 'tax_rates_company_active_idx')
    await queryInterface.removeIndex('tax_rates', 'tax_rates_single_default_per_company_idx')

    await queryInterface.removeColumn('tax_rates', 'description')
    await queryInterface.removeColumn('tax_rates', 'tax_type')

    await queryInterface.renameColumn('tax_rates', 'rate_percentage', 'rate')
    await queryInterface.renameColumn('tax_rates', 'name', 'label')

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_tax_rates_tax_type";')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_tax_exemptions_exemption_type";')
  },
}
