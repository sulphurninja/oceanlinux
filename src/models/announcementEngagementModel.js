import mongoose from 'mongoose';

/** Per-user email open / link click for announcement analytics (unique counts). */
const announcementEngagementSchema = new mongoose.Schema(
  {
    announcementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Announcement',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    emailOpened: { type: Boolean, default: false },
    emailOpenedAt: { type: Date },
    linkClicked: { type: Boolean, default: false },
    linkClickedAt: { type: Date },
  },
  { timestamps: true }
);

announcementEngagementSchema.index({ announcementId: 1, userId: 1 }, { unique: true });

export default mongoose.models.AnnouncementEngagement ||
  mongoose.model('AnnouncementEngagement', announcementEngagementSchema);
