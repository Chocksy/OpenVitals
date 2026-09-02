/**
 * `/uploads/[id]` folded into Blood in phase 30a. The upload detail itself
 * is rebuilt in phase 30c; until then this route renders the old page so the
 * redirect from `/uploads/:id` has somewhere to land.
 */
export { default } from "../../../uploads/[id]/page";
