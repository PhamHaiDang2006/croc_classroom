import type { Student } from "@croc-classroom/shared";
import { date, unwrap, type Ctx } from "./common.js";

/** Màn "Sinh viên" của giảng viên: trạng thái tài khoản, vô hiệu hoá, cấp lại mã kích hoạt. */
export function StudentsPage({
  ctx: { api, busy, run, setMessage },
  students,
  setStudents,
}: {
  ctx: Ctx;
  students: Student[];
  setStudents: (students: Student[]) => void;
}) {
  return (
    <section className="surface">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Sinh viên</th>
              <th>Lớp</th>
              <th>Tài khoản</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id}>
                <td>
                  <strong>{student.fullName}</strong>
                  <small>{student.mssv}</small>
                </td>
                <td>{student.classLabel ?? "—"}</td>
                <td>
                  {student.disabled
                    ? "Đã vô hiệu hoá"
                    : student.activated
                      ? "Đã kích hoạt"
                      : "Chờ kích hoạt"}
                </td>
                <td>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await unwrap(
                          api.invoke("students.setDisabled", {
                            studentId: student.id,
                            disabled: !student.disabled,
                          }),
                        );
                        setStudents(
                          await unwrap(api.invoke("students.list")),
                        );
                      })
                    }
                  >
                    {student.disabled ? "Mở lại" : "Vô hiệu hoá"}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const code = await unwrap(
                          api.invoke("students.reissueActivation", {
                            studentId: student.id,
                          }),
                        );
                        setMessage(
                          `Mã kích hoạt của ${code.mssv}: ${code.activationCode}. Hạn: ${date(code.activationExpiresAt)}`,
                        );
                      })
                    }
                  >
                    Cấp lại mã
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
