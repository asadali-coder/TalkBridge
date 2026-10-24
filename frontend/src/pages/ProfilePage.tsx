import { useState } from "react";
import { isUserBanned } from "../lib/sharedMethod";
import { useAuthStore } from "../store/useAuthStore";
import { Camera, Mail, User, Check, X, Pencil } from "lucide-react";

const ProfilePage = () => {
  const { authUser, isUpdatingProfile, updateProfile } = useAuthStore();

  const blocked = isUserBanned(authUser);
  const [selectedImg, setSelectedImg] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [fullName, setFullName] = useState(authUser?.fullName || "");

  const memberSince = authUser?.createdAt?.split("T")[0] || "-";

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => setSelectedImg(reader.result as string);

    const formData = new FormData();
    formData.append("image", file);
    const saved = await updateProfile(formData);
    if (!saved) setSelectedImg(null);
  };

  const onSave = async () => {
    const name = fullName.trim();
    if (!name) return;

    const formData = new FormData();
    formData.append("fullName", name);
    if (await updateProfile(formData)) setIsEditing(false);
  };

  const onCancel = () => {
    setFullName(authUser?.fullName || "");
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-base-100">
      {/* Header */}
      <div className="relative pt-20 pb-10">
        <div className="absolute inset-0 h-56 bg-gradient-to-r from-blue-600/30 via-indigo-500/20 to-cyan-500/20 blur-0" />
        <div className="relative max-w-3xl mx-auto px-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold">Profile</h1>
              <p className="opacity-70 mt-1">
                Manage your account and personal info
              </p>
            </div>

            {!isEditing ? (
              <button
                className="btn btn-sm btn-outline"
                onClick={() => {
                  setFullName(authUser?.fullName || "");
                  setIsEditing(true);
                }}
                disabled={isUpdatingProfile}
              >
                <Pencil size={16} />
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={onSave}
                  disabled={isUpdatingProfile || !fullName.trim()}
                >
                  <Check size={16} />
                  Save
                </button>
                <button
                  className="btn btn-sm"
                  onClick={onCancel}
                  disabled={isUpdatingProfile}
                >
                  <X size={16} />
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-4 pb-10">
        <div className="bg-base-200/60 backdrop-blur rounded-2xl border border-base-300 shadow-sm overflow-hidden">
          {/* Top card */}
          <div className="p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className="relative">
              <img
                src={selectedImg || authUser?.profilePicture || "/avatar.png"}
                alt="Profile"
                className="size-28 sm:size-32 rounded-full object-cover ring-4 ring-base-100 shadow"
              />

              <label
                htmlFor="avatar-upload"
                className={`absolute bottom-6 right-1 bg-base-content text-base-200 p-2 rounded-full cursor-pointer hover:scale-105 transition ${
                  isUpdatingProfile ? "animate-pulse pointer-events-none" : ""
                }`}
                title="Change photo"
              >
                <Camera className="w-5 h-5" />
                <input
                  type="file"
                  id="avatar-upload"
                  className="hidden"
                  accept="image/*"
                  name="image"
                  onChange={handleImageUpload}
                  disabled={isUpdatingProfile}
                />
              </label>

              <div className="mt-3 text-center text-xs opacity-70">
                {isUpdatingProfile ? "Updating..." : "Tap camera to change"}
              </div>
            </div>

            {/* Identity */}
            <div className="flex-1 w-full">
              <div className="flex flex-col gap-4">
                {/* Full Name */}
                <div>
                  <div className="text-xs opacity-70 flex items-center gap-2 mb-1">
                    <User className="w-4 h-4" />
                    Full Name
                  </div>

                  {!isEditing ? (
                    <div className="px-4 py-3 rounded-xl bg-base-100 border border-base-300">
                      {authUser?.fullName || "-"}
                    </div>
                  ) : (
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="input input-bordered w-full rounded-xl bg-base-100"
                      placeholder="Enter your name"
                      autoFocus
                    />
                  )}
                </div>

                {/* Email */}
                <div>
                  <div className="text-xs opacity-70 flex items-center gap-2 mb-1">
                    <Mail className="w-4 h-4" />
                    Email
                  </div>
                  <div className="px-4 py-3 rounded-xl bg-base-100 border border-base-300 opacity-90">
                    {authUser?.email || "-"}
                  </div>
                  <div className="text-xs opacity-60 mt-1">
                    Email can’t be changed from here.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-base-300" />

          {/* Account info */}
          <div className="p-6 sm:p-8">
            <h2 className="text-lg font-semibold mb-4">Account</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl bg-base-100 border border-base-300 p-4">
                <div className="text-xs opacity-70 mb-1">Member Since</div>
                <div className="font-medium">{memberSince}</div>
              </div>

              <div className="rounded-xl bg-base-100 border border-base-300 p-4">
                <div className="text-xs opacity-70 mb-1">Account Status</div>
                <div className="inline-flex items-center gap-2">
                  <span
                    className={`badge badge-sm ${blocked ? "badge-error" : "badge-success"}`}
                  >
                    {blocked ? "Blocked" : "Active"}
                  </span>
                  <span className="text-sm opacity-70">
                    {blocked ? "Messaging restricted for 24 hours" : "All good"}
                  </span>
                </div>
              </div>
            </div>

            {/* little unique footer */}
            <div className="mt-6 text-xs opacity-60">
              Tip: Keep your profile photo clear so friends can recognize you
              quickly.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
