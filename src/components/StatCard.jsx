function StatCard({ icon: Icon, label, value, trend, iconClass }) {
  return (
    <div className="stat-card">
      <div className={`stat-card-icon ${iconClass}`}>
        <Icon size={21} strokeWidth={2} />
      </div>

      <div className="stat-card-content">
        <p>{label}</p>
        <h2>{value}</h2>
        <span>{trend}</span>
      </div>
    </div>
  );
}

export default StatCard;
