import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Static method to get a setting by key
settingsSchema.statics.getSetting = async function(key, defaultValue = null) {
  const setting = await this.findOne({ key });
  return setting ? setting.value : defaultValue;
};

// Static method to set a setting
settingsSchema.statics.setSetting = async function(key, value, description = '', updatedBy = null) {
  return await this.findOneAndUpdate(
    { key },
    { value, description, updatedBy },
    { upsert: true, new: true }
  );
};

// Default settings
settingsSchema.statics.DEFAULTS = {
  WHATSAPP_NUMBER: '+918004277632',
  WHATSAPP_MESSAGE: 'Hi! I need help with OceanLinux services.',
  SUPPORT_EMAIL: 'support@oceanlinux.com'
};

const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

export default Settings;
