/** Курсийн төлөх үнэ = max(0, курсийн үнэ − тухайн курсийн хичээлд аль хэдийн зарцуулсан кредит). */
export function courseRemainingCredits(coursePrice: number, ownedLessons: number, lessonPrice: number): number {
  return Math.max(0, coursePrice - ownedLessons * lessonPrice);
}

export type VarStyle = React.CSSProperties & Record<`--${string}`, string | number>;
