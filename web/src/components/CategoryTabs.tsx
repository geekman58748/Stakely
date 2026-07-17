import { ChevronRight } from "lucide-react";
import { categories } from "../data/mockData";

export function CategoryTabs() {
  return (
    <div className="category-tabs" aria-label="Market categories">
      {categories.map(({ label, icon: Icon, active }) => (
        <button className={active ? "active" : ""} key={label} type="button">
          <Icon size={18} />
          <span>{label}</span>
          {label === "More" ? <ChevronRight size={16} /> : null}
        </button>
      ))}
    </div>
  );
}
