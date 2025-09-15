import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema({
    ticketId: {
        type: String,
        required: true,
        unique: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true,
        enum: ['technical', 'billing', 'general', 'security', 'feature-request']
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    status: {
        type: String,
        enum: ['open', 'in-progress', 'waiting-response', 'resolved', 'closed'],
        default: 'open'
    },
    messages: [{
        author: {
            type: String, // 'user' or 'admin'
            required: true
        },
        authorName: {
            type: String,
            required: true
        },
        message: {
            type: String,
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        isInternal: {
            type: Boolean,
            default: false
        }
    }],
    assignedTo: {
        type: String, // Admin email or ID
        default: null
    },
    tags: [{
        type: String,
        trim: true
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    resolvedAt: {
        type: Date,
        default: null
    }
});

const SupportTicket = mongoose.models.SupportTicket || mongoose.model('SupportTicket', supportTicketSchema);

export default SupportTicket;
