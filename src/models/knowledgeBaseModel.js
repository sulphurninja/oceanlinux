import mongoose from 'mongoose';

const knowledgeBaseSchema = new mongoose.Schema({
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    content: { type: String, required: true },
    excerpt: { type: String, required: true },
    category: {
        type: String,
        required: true,
        enum: ['Getting Started', 'VPS Management', 'Security', 'Troubleshooting', 'Billing', 'General']
    },
    tags: [{ type: String }],
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    published: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    readTime: { type: Number, default: 5 }, // minutes
    seoTitle: { type: String },
    seoDescription: { type: String },
    aiGenerated: { type: Boolean, default: false },
    aiPrompt: { type: String }, // Store the original AI prompt
    lastModified: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
knowledgeBaseSchema.index({ slug: 1 });
knowledgeBaseSchema.index({ category: 1 });
knowledgeBaseSchema.index({ published: 1 });
knowledgeBaseSchema.index({ featured: 1 });
knowledgeBaseSchema.index({ createdAt: -1 });
knowledgeBaseSchema.index({ views: -1 });

// Pre-save middleware to update lastModified
knowledgeBaseSchema.pre('save', function(next) {
    this.lastModified = new Date();
    next();
});

export default mongoose.models.KnowledgeBase || mongoose.model('KnowledgeBase', knowledgeBaseSchema);
