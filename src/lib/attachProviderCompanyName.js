const mongoose = require('mongoose');

function unwrap(mod) {
  return mod && mod.default ? mod.default : mod;
}

function validId(value) {
  return value && mongoose.Types.ObjectId.isValid(String(value));
}

/**
 * Adds providerCompanyName from the order's IP stock or trial company.
 * The name is the same Company.name shown on Admin → Companies.
 * Does not copy API credentials.
 */
async function attachProviderCompanyNames(orders) {
  const list = Array.isArray(orders) ? orders : [];
  if (!list.length) return list;

  const IPStock = unwrap(require('@/models/ipStockModel'));
  const Company = unwrap(require('@/models/companyModel'));

  const stockIds = [...new Set(list.map((order) => String(order?.ipStockId || '')).filter(validId))];
  const stocks = stockIds.length
    ? await IPStock.find({ _id: { $in: stockIds } }).select('company').lean()
    : [];

  const companyIds = new Set(stocks.map((stock) => String(stock.company || '')).filter(validId));
  for (const order of list) {
    const trialCompanyId = String(order?.trialManageCompanyId || '');
    if (validId(trialCompanyId)) companyIds.add(trialCompanyId);
  }

  const companies = companyIds.size
    ? await Company.find({ _id: { $in: [...companyIds] } }).select('name').lean()
    : [];

  const nameByCompany = new Map(
    companies.map((company) => [String(company._id), company?.name ? String(company.name).trim() : ''])
  );
  const nameByStock = new Map(
    stocks.map((stock) => [String(stock._id), nameByCompany.get(String(stock.company || '')) || ''])
  );

  return list.map((order) => {
    const fromStock = nameByStock.get(String(order?.ipStockId || '')) || '';
    const fromTrial = nameByCompany.get(String(order?.trialManageCompanyId || '')) || '';
    return {
      ...order,
      providerCompanyName: fromStock || fromTrial || order?.providerCompanyName || '',
    };
  });
}

module.exports = { attachProviderCompanyNames };
